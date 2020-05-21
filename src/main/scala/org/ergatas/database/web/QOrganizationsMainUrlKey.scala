package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QOrganizationsMainUrlKey extends QOrganizationsMainUrlKey("organizationsMainUrlKey") {
  override def as(variable: String) = new QOrganizationsMainUrlKey(variable)

}

class QOrganizationsMainUrlKey(md: PathMetadata[_]) extends RelationalPathImpl[OrganizationsMainUrlKey](md, "web", "organizations_main_url_key") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

